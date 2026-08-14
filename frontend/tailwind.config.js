/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        // VOXEL CUP THEME — explicit hex values (oklch converted per spec).
        // Registered here so utility classes like `bg-vc-gold`, `text-vc-red`,
        // `border-vc-blue/40` resolve to plain hex/rgb with alpha support.
        vc: {
          gold: '#ffd21c',
          blue: '#2f74ff',
          red: '#ff2d3c',
          violet: '#c56bff',
          green: '#20d47a',
          ink: '#0b1428',
          'ink-dark': '#080f24',
          foreground: '#f0f4ff',
          panel: '#101a33',
          'panel-dark': '#080f24',
          card: '#0a1330',
          'blue-bg': '#1a3a6e',
          'red-bg': '#5c1a1a',
          'blue-chip': '#1e3a5f',
          'red-chip': '#5c1a1a',
          'very-dark': '#050b20',
          black: '#03060f',
          gray: '#777777',
          'light-gray': '#9a9a9a'
        }
      },
      fontFamily: {
        display: ['"Anton"', '"Saira Condensed"', 'sans-serif'],
        body: ['"Outfit"', 'sans-serif'],
        sans: ['"Outfit"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};