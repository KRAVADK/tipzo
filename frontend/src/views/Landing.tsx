import React from 'react';
import { NeoButton, NeoCard, KineticTypeSphere } from '../components/NeoComponents';
import { Shield, Zap, TrendingUp, Lock } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
}

const Landing: React.FC<LandingProps> = ({ onGetStarted }) => {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex flex-col md:flex-row items-center justify-between px-6 py-20 max-w-7xl mx-auto w-full gap-12">
        <div className="flex-1 space-y-8 z-10">
          <div className="inline-block border-2 border-black bg-tipzo-pink px-4 py-2 font-bold shadow-neo-sm rotate-[-2deg]">
            Now Live on Aleo Testnet
          </div>
          <h1 className="text-6xl md:text-8xl font-black leading-[0.9] tracking-tight">
            SUPPORT<br/>
            CREATORS<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-tipzo-orange to-tipzo-pink stroke-black" style={{ WebkitTextStroke: '2px black' }}>PRIVATELY</span>
          </h1>
          <p className="text-xl font-medium text-gray-700 max-w-lg">
            Tipzo is the first anonymous donation platform powered by zero-knowledge proofs. 
            Support your favorite artists without exposing your identity.
          </p>
          <div className="flex gap-4">
            <NeoButton size="lg" onClick={onGetStarted}>Start Exploring</NeoButton>
            <NeoButton variant="secondary" size="lg" onClick={() => window.open('https://aleo.org', '_blank')}>Learn Aleo</NeoButton>
          </div>
        </div>
        
        <div className="flex-1 flex justify-center items-center relative min-h-[400px]">
           <div className="scale-125 z-20">
             <KineticTypeSphere />
           </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="bg-black text-white py-4 overflow-hidden border-y-2 border-black">
        <div className="animate-marquee whitespace-nowrap font-mono font-bold text-xl uppercase tracking-widest">
           zk-SNARKs Powered • Anonymous Tipping • Instant Settlement • Creator Economy • Tipzo • Aleo Network • No Tracking • 
           zk-SNARKs Powered • Anonymous Tipping • Instant Settlement • Creator Economy • Tipzo • Aleo Network • No Tracking • 
        </div>
      </div>

      {/* Features Grid - light card backgrounds: black text in dark mode */}
      <section className="tipzo-page-light-frames px-6 py-24 max-w-7xl mx-auto w-full">
        <h2 className="text-5xl font-black mb-16 text-center tipzo-dark-white">WHY TIPZO?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <NeoCard color="yellow" className="h-full flex flex-col items-start gap-4 hover:-translate-y-2 transition-transform">
            <div className="p-3 bg-white border-2 border-black shadow-neo-sm">
              <Shield size={32} />
            </div>
            <h3 className="text-2xl font-bold">Default Privacy</h3>
            <p className="font-medium">Transactions are encrypted by default using Aleo's Leo language. Only you know who you support.</p>
          </NeoCard>

          <NeoCard color="green" className="h-full flex flex-col items-start gap-4 hover:-translate-y-2 transition-transform">
            <div className="p-3 bg-white border-2 border-black shadow-neo-sm">
              <Lock size={32} />
            </div>
            <h3 className="text-2xl font-bold">Proven Compliance</h3>
            <p className="font-medium">Selective disclosure allows creators to prove income for taxes without revealing donor identities.</p>
          </NeoCard>

          <NeoCard color="pink" className="h-full flex flex-col items-start gap-4 hover:-translate-y-2 transition-transform">
             <div className="p-3 bg-white border-2 border-black shadow-neo-sm">
              <TrendingUp size={32} />
            </div>
            <h3 className="text-2xl font-bold">Deep Analytics</h3>
            <p className="font-medium">Track your donation habits and income streams with beautiful, private-by-default charts.</p>
          </NeoCard>

          <NeoCard color="orange" className="h-full flex flex-col items-start gap-4 hover:-translate-y-2 transition-transform">
             <div className="p-3 bg-white border-2 border-black shadow-neo-sm">
              <Zap size={32} />
            </div>
            <h3 className="text-2xl font-bold">Scalable</h3>
            <p className="font-medium">Built on decentralized infrastructure that scales with the creator economy.</p>
          </NeoCard>
        </div>
      </section>

      {/* CTA Section - white card: black text in dark mode */}
      <section className="tipzo-page-light-frames px-6 py-20 bg-tipzo-blue text-center mb-20">
         <NeoCard className="max-w-4xl mx-auto bg-white" color="white">
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-4xl md:text-5xl font-black">Ready to join the revolution?</h2>
              <p className="text-xl max-w-2xl">Create your profile in seconds and start receiving anonymous donations today.</p>
              <NeoButton size="lg" variant="accent" onClick={onGetStarted}>Create Profile</NeoButton>
            </div>
         </NeoCard>
      </section>
    </div>
  );
};

export default Landing;
