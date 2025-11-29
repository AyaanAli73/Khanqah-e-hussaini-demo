// Shared Tailwind CSS Configuration
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'royal': '#002B20',
                'emerald': '#0A4D38',
                'gold': '#D4AF37',
                'gold-light': '#F3E5AB',
                'cream': '#FDFBF7',
                'sand': '#F5F5F0',
            },
            fontFamily: {
                'serif': ['"Playfair Display"', 'serif'],
                'sans': ['"Plus Jakarta Sans"', 'sans-serif'],
                'arabic': ['"Amiri"', 'serif'],
            },
            backgroundImage: {
                'pattern': "url('../assets/images/background.jpg')",
            },
            animation: {
                'spin-slow': 'spin 12s linear infinite',
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'slide-down': 'slideDown 0.8s ease-out forwards',
                'scroll': 'scroll 40s linear infinite',
                'shine': 'shine 1.5s',
                'marquee': 'marquee 25s linear infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-1000px 0' },
                    '100%': { backgroundPosition: '1000px 0' },
                },
                slideDown: {
                    '0%': { transform: 'translateY(-100%)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                scroll: {
                    '0%': { transform: 'translateX(0)' },
                    '100%': { transform: 'translateX(-100%)' },
                },
                shine: {
                    '100%': { left: '125%' }
                },
                marquee: {
                    '0%': { transform: 'translate(0, 0)' },
                    '100%': { transform: 'translate(-100%, 0)' }
                }
            }
        }
    }
};

