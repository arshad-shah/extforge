@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: 255 255 255;
  --color-bg-secondary: 245 245 245;
  --color-text: 17 24 39;
  --color-text-secondary: 107 114 128;
  --color-border: 229 231 235;
  --color-primary: 37 99 235;
  --color-primary-hover: 29 78 216;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: 17 24 39;
    --color-bg-secondary: 31 41 55;
    --color-text: 243 244 246;
    --color-text-secondary: 156 163 175;
    --color-border: 55 65 81;
    --color-primary: 96 165 250;
    --color-primary-hover: 59 130 246;
  }
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: rgb(var(--color-bg));
  color: rgb(var(--color-text));
}
