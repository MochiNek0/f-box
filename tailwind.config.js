/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        border: "hsl(var(--border))",
      },
      spacing: {
        "gr-1": "4px",
        "gr-2": "8px",
        "gr-3": "12px",
        "gr-4": "20px",
        "gr-5": "32px",
        "gr-6": "52px",
        "gr-7": "84px",
        "gr-8": "136px",
      },
      borderRadius: {
        "gr-1": "2px",
        "gr-2": "4px",
        "gr-3": "6px",
        "gr-4": "10px",
        "gr-5": "16px",
      },
    },
  },
  plugins: [],
};
