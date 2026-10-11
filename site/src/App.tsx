import React from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Commands } from './components/Commands';
import { HowItWorks } from './components/HowItWorks';
import { Playground } from './components/Playground';
import { Benchmark } from './components/Benchmark';
import { Install } from './components/Install';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Commands />
        <HowItWorks />
        <Playground />
        <Benchmark />
        <Install />
      </main>
      <Footer />
    </>
  );
}
