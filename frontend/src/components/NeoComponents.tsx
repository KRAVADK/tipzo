import React from 'react';

// --- Types ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  color?: 'white' | 'yellow' | 'green' | 'pink' | 'orange';
}

// --- Components ---

export const NeoButton: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "font-bold border-2 border-black transition-all duration-200 ease-in-out active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";
  
  const variants = {
    primary: "bg-tipzo-yellow hover:bg-yellow-300 shadow-neo text-black",
    secondary: "bg-white hover:bg-gray-100 shadow-neo text-black",
    accent: "bg-tipzo-green hover:bg-green-300 shadow-neo text-black",
    danger: "bg-red-400 hover:bg-red-500 shadow-neo text-white"
  };

  const sizes = {
    sm: "px-3 py-1 text-sm shadow-neo-sm",
    md: "px-6 py-2 text-base shadow-neo",
    lg: "px-8 py-4 text-xl shadow-neo"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const NeoCard: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  color = 'white' 
}) => {
  const colors = {
    white: 'bg-white',
    yellow: 'bg-tipzo-yellow',
    green: 'bg-tipzo-green',
    pink: 'bg-tipzo-pink',
    orange: 'bg-tipzo-orange',
  };

  return (
    <div className={`border-2 border-black shadow-neo ${colors[color]} p-6 ${className}`}>
      {children}
    </div>
  );
};

export const NeoInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  return (
    <input 
      className="w-full border-2 border-black p-3 font-medium bg-white shadow-neo-sm focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none transition-all placeholder:text-gray-400"
      {...props}
    />
  );
};

export const NeoTextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
  return (
    <textarea 
      className="w-full border-2 border-black p-3 font-medium bg-white shadow-neo-sm focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none transition-all placeholder:text-gray-400"
      {...props}
    />
  );
};

export const NeoBadge: React.FC<{ children: React.ReactNode, color?: string }> = ({ children, color = 'bg-gray-200' }) => {
  return (
    <span className={`inline-block border-2 border-black px-2 py-0.5 text-xs font-bold ${color}`}>
      {children}
    </span>
  )
}

export const KineticTypeSphere: React.FC = () => {
  // Config for the sphere words
  const tags = [
    { text: 'PRIVACY', color: '#BBF7D0', lat: 0, lng: 0 },
    { text: 'ZK-PROOF', color: '#FDE68A', lat: 30, lng: 45 },
    { text: 'ALEO', color: '#F5D0FE', lat: -30, lng: 90 },
    { text: 'TIPZO', color: '#FDBA74', lat: 60, lng: 135 },
    { text: 'ANONYMOUS', color: '#ffffff', lat: -60, lng: 180 },
    { text: 'SECURE', color: '#BBF7D0', lat: 0, lng: 225 },
    { text: 'DEFI', color: '#FDE68A', lat: 45, lng: 270 },
    { text: 'CREATOR', color: '#F5D0FE', lat: -45, lng: 315 },
    { text: '0x1', color: '#FDBA74', lat: 80, lng: 0 },
    { text: 'WEB3', color: '#ffffff', lat: -80, lng: 0 },
    { text: 'FUTURE', color: '#BBF7D0', lat: 20, lng: 110 },
    { text: 'FREEDOM', color: '#FDE68A', lat: -20, lng: 250 },
    { text: 'VERIFIED', color: '#F5D0FE', lat: 50, lng: 190 },
    { text: 'SUPPORT', color: '#FDBA74', lat: -50, lng: 60 },
  ];

  const radius = 150;

  return (
    <div className="sphere-scene">
      <div className="sphere">
        {tags.map((tag, i) => (
          <div
            key={i}
            className="sphere-tag"
            style={{
              backgroundColor: tag.color,
              // Position on the sphere surface using rotation
              transform: `rotateY(${tag.lng}deg) rotateX(${tag.lat}deg) translateZ(${radius}px)`
            }}
          >
            {tag.text}
          </div>
        ))}
      </div>
    </div>
  );
};
