import { useEffect, useRef } from "react";

export const useParallax = (speed: number = 0.5) => {
    const elementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        const handleScroll = () => {
            const scrolled = window.pageYOffset;
            const parallax = scrolled * speed;
            element.style.transform = `translateY(${parallax}px)`;
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [speed]);

    return elementRef;
};

