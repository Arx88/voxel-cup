// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

function makeDevServerV5Compatible(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    onListening,
    setupMiddlewares,
    proxy,  // preserve proxy
    ...compatibleConfig
  } = devServerConfig;

  // Re-add proxy if it was set
  if (proxy) compatibleConfig.proxy = proxy;

  compatibleConfig.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";
  compatibleConfig.headers = {
    ...compatibleConfig.headers,
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    compatibleConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) {
        onBeforeSetupMiddleware(devServer);
      }

      return setupMiddlewares
        ? setupMiddlewares(middlewares, devServer)
        : middlewares;
    };
  }

  compatibleConfig.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);

    if (onListening) {
      onListening(devServer);
    }
    if (onAfterSetupMiddleware) {
      onAfterSetupMiddleware(devServer);
    }
  };

  return compatibleConfig;
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // ===== Tailwind v4 PostCSS plugin override ===========================
      // react-scripts v5 hardcodes `'tailwindcss'` (the v3 PostCSS entry) in
      // its postcss-loader options whenever tailwind.config.js exists, and
      // sets `config: false` so postcss.config.js is ignored. Under v4 the
      // PostCSS plugin moved to a separate `@tailwindcss/postcss` package —
      // the bare `tailwindcss` entry throws on load. We walk the webpack
      // module rules, find every postcss-loader, and replace its options
      // with the v4 plugin + the standard CRA postcss pipeline (flexbugs,
      // preset-env with autoprefixer, normalize).
      const tailwindPostcssPath = require.resolve("@tailwindcss/postcss");
      const replacePostcss = (rule) => {
        if (!rule) return;
        if (rule.oneOf) {
          rule.oneOf.forEach(replacePostcss);
          return;
        }
        if (Array.isArray(rule.use)) {
          rule.use.forEach((loader) => {
            if (
              loader &&
              typeof loader === "object" &&
              loader.loader &&
              loader.loader.includes("postcss-loader")
            ) {
              loader.options = {
                postcssOptions: {
                  ident: "postcss",
                  config: false,
                  plugins: [
                    tailwindPostcssPath,
                    "postcss-flexbugs-fixes",
                    [
                      "postcss-preset-env",
                      {
                        autoprefixer: { flexbox: "no-2009" },
                        stage: 3,
                      },
                    ],
                    "postcss-normalize",
                  ],
                },
                sourceMap: loader.options && loader.options.sourceMap,
              };
            }
          });
        }
      };
      if (Array.isArray(webpackConfig.module.rules)) {
        webpackConfig.module.rules.forEach(replacePostcss);
      }

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Proxy /api requests to the backend (FastAPI on port 8001)
  devServerConfig.proxy = {
    '/api': {
      target: 'http://localhost:8002',
      changeOrigin: true,
      ws: true,
    },
  };

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
}

// webpack-dev-server v5 (forced via `resolutions`) rejects react-scripts 5's
// v4 dev-server API (onBeforeSetupMiddleware / onAfterSetupMiddleware / https)
// and expects `proxy` as an array. Convert react-scripts' config and add the
// /api proxy in the v5 format.
webpackConfig.devServer = (devServerConfig) => {
  const compatible = makeDevServerV5Compatible(devServerConfig || {});
  compatible.proxy = [
    {
      context: ['/api'],
      target: 'http://localhost:8002',
      changeOrigin: true,
      ws: true,
    },
  ];
  return compatible;
};

module.exports = webpackConfig;
