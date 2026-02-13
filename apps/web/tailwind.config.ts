import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f4efe4",
        ink: "#161718",
        accent: "#0d8069",
        ember: "#d07021"
      },
      boxShadow: {
        panel: "0 14px 40px rgba(18, 24, 34, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
