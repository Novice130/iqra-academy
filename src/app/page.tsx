import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import TrustBar from "@/components/landing/TrustBar";
import ProblemSolution from "@/components/landing/ProblemSolution";
import HowItWorks from "@/components/landing/HowItWorks";
import Curriculum from "@/components/landing/Curriculum";
import LiveClassExperience from "@/components/landing/LiveClassExperience";
import Pricing from "@/components/landing/Pricing";
import Testimonials from "@/components/landing/Testimonials";
import ForParents from "@/components/landing/ForParents";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-gray-900">
      <Navbar />
      <Hero />
      <TrustBar />
      <ProblemSolution />
      <HowItWorks />
      <Curriculum />
      <LiveClassExperience />
      <Pricing />
      <Testimonials />
      <ForParents />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
