/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0d9488',
        'primary-dark': '#0f766e',
        'primary-light': '#99f6e4',
      },
    },
  },
  plugins: [],
}
