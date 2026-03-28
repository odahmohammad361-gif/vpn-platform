/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#dce6ff",
          400: "#6b8fff",
          500: "#4d6ef5",
          600: "#3a57e8",
          700: "#2d45cc",
          900: "#1a2a7a",
        },
      },
    },
  },
  plugins: [],
}
