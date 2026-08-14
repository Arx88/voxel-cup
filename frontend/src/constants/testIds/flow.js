export const SPLASH = {
  root: "splash-screen",
  logo: "splash-logo",
  progress: "splash-progress",
  percent: "splash-percent",
  soundToggle: "sound-toggle",
};

export const ONBOARDING = {
  root: "onboarding-screen",
  slide: "onboarding-slide",
  next: "onboarding-next",
  skip: "onboarding-skip",
  dot: (i) => `onboarding-dot-${i}`,
};

export const CREATOR = {
  root: "creator-screen",
  back: "creator-back",
  name: "creator-name-input",
  dice: "creator-dice-button",
  preview: "creator-preview-button",
  play: "creator-play-button",
  stage: "creator-3d-stage",
  tab: (id) => `creator-tab-${id}`,
  hairPrev: "creator-hair-prev",
  hairNext: "creator-hair-next",
  hairOption: (i) => `creator-hair-option-${i}`,
  hairColor: (i) => `creator-haircolor-${i}`,
  skin: (i) => `creator-skin-${i}`,
  shirt: (i) => `creator-shirt-${i}`,
  number: (i) => `creator-number-${i}`,
  face: (i) => `creator-face-${i}`,
  eye: (i) => `creator-eye-${i}`,
  accessory: (i) => `creator-accessory-${i}`,
  accColor: (i) => `creator-acccolor-${i}`,
  body: (i) => `creator-body-${i}`,
  kit: (i) => `creator-kit-${i}`,
};
