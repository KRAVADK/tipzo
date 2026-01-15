import { useEffect } from "react";
import "./Toast.css";

interface ToastProps {
    message: string;
    type: "error" | "warning" | "success";
    onClose: () => void;
    duration?: number;
}

export const Toast = ({ message, type, onClose, duration = 5000 }: ToastProps) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [onClose, duration]);

    const icons = {
        error: "❌",
        warning: "⚠️",
        success: "✅",
    };

    return (
        <div className={`toast toast-${type} slide-in`}>
            <div className="toast-icon">{icons[type]}</div>
            <div className="toast-message">{message}</div>
            <button className="toast-close" onClick={onClose}>×</button>
        </div>
    );
};

