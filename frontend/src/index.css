@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;900&family=Manrope:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
    margin: 0;
    background: #050505;
    color: #ffffff;
    font-family: 'Manrope', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, .font-display {
    font-family: 'Outfit', system-ui, sans-serif;
    letter-spacing: -0.02em;
}

::selection { background: #00FF66; color: #000; }

@layer base {
    :root {
        --background: 0 0% 2%;
        --foreground: 0 0% 100%;
        --card: 0 0% 7%;
        --card-foreground: 0 0% 100%;
        --popover: 0 0% 7%;
        --popover-foreground: 0 0% 100%;
        --primary: 138 100% 50%;
        --primary-foreground: 0 0% 0%;
        --secondary: 0 0% 11%;
        --secondary-foreground: 0 0% 100%;
        --muted: 0 0% 11%;
        --muted-foreground: 240 5% 65%;
        --accent: 0 0% 11%;
        --accent-foreground: 0 0% 100%;
        --destructive: 0 84% 60%;
        --destructive-foreground: 0 0% 100%;
        --border: 240 4% 16%;
        --input: 240 4% 16%;
        --ring: 138 100% 50%;
        --radius: 0.75rem;
    }
}

@layer base {
    * { @apply border-border; }
    body { @apply bg-background text-foreground; }
}

/* Subtle grain overlay */
.grain::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
    opacity: 0.05;
    mix-blend-mode: overlay;
}

.glow-green {
    box-shadow: 0 0 40px rgba(0, 255, 102, 0.35), 0 0 80px rgba(0, 255, 102, 0.15);
}

.text-glow {
    text-shadow: 0 0 20px rgba(0, 255, 102, 0.6);
}

@keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
.animate-spin-slow { animation: spin-slow 6s linear infinite; }

@keyframes float-3d {
    0%, 100% { transform: perspective(600px) rotateY(0deg) rotateX(10deg); }
    50% { transform: perspective(600px) rotateY(15deg) rotateX(-5deg); }
}
.animate-3d { animation: float-3d 4s ease-in-out infinite; }

.marquee-track { animation: marquee 30s linear infinite; }
@keyframes marquee {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
}

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

@keyframes shimmer {
    to { background-position: 200% center; }
}
