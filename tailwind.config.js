/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0D0A0E',
          elevated: '#171218',
          card: '#211823',
          hover: '#2A1F2D',
          border: 'rgba(255, 255, 255, 0.08)'
        },
        primary: {
          DEFAULT: '#B5D94C',
          hover: '#A2C43F',
          muted: 'rgba(181, 217, 76, 0.12)',
          dark: '#0D0A0E'
        },
        secondary: {
          DEFAULT: '#8b5cf6',
          hover: '#7c3aed'
        },
        accent: {
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e'
        }
      },
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
        reading: ['Poppins', 'sans-serif']
      }
    },
  },
  plugins: [],
}
