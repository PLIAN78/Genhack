import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, Shield, Heart, Brain, Zap, Lock, TrendingUp } from "lucide-react";

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || "http://localhost:3001";
const DASHBOARD_APP_URL = `${DASHBOARD_URL}`;

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Shield className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="text-lg font-bold">Security Copilot</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition">
              How It Works
            </a>
            <a href="#tech" className="text-sm text-muted-foreground hover:text-foreground transition">
              Technology
            </a>
          </div>
          <Button 
            onClick={() => window.location.href = DASHBOARD_APP_URL}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Try Now
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="container relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/5 mb-6">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Real-time AI Analysis</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              See Beyond the Surface
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Security Copilot uses advanced multimodal AI to detect behavioral indicators of deception in real-time. Analyze ocular, kinetic, and physiological signals with a single camera.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => window.location.href = DASHBOARD_APP_URL}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Launch Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-border hover:bg-card"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              >
                View Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32 border-t border-border/40">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Comprehensive Analysis</h2>
            <p className="text-lg text-muted-foreground">
              Three modalities. One platform. Unprecedented insight.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Ocular Feature */}
            <div className="group p-8 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-accent/40 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition">
                <Eye className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold mb-3">Ocular Forensics</h3>
              <p className="text-muted-foreground">
                Track gaze patterns, blink volatility, saccadic movements, and peripheral scanning to detect evasion and anxiety.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Gaze deviation tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Blink rate analysis
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Rapid eye movements
                </li>
              </ul>
            </div>

            {/* Kinetic Feature */}
            <div className="group p-8 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-accent/40 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition">
                <Shield className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold mb-3">Kinetic Forensics</h3>
              <p className="text-muted-foreground">
                Analyze body posture, hand tremors, and defensive gestures to identify protective and nervous behaviors.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Ventral shielding detection
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Hand tremor analysis
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Posture tracking
                </li>
              </ul>
            </div>

            {/* Cardiac Feature */}
            <div className="group p-8 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-accent/40 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition">
                <Heart className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold mb-3">Cardiac Forensics</h3>
              <p className="text-muted-foreground">
                Measure heart rate remotely using cutting-edge rPPG technology—no contact sensors required.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Remote heart rate detection
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Carotid pulse analysis
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                  Physiological arousal tracking
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 md:py-32 border-t border-border/40 bg-card/30">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-muted-foreground">
              From camera feed to actionable intelligence in milliseconds.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="relative">
              <div className="p-6 rounded-xl border border-border/40 bg-background">
                <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold mb-4">
                  1
                </div>
                <h3 className="font-bold mb-2">Capture</h3>
                <p className="text-sm text-muted-foreground">
                  Standard camera captures live video feed
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-gradient-to-r from-accent to-transparent" />
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="p-6 rounded-xl border border-border/40 bg-background">
                <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold mb-4">
                  2
                </div>
                <h3 className="font-bold mb-2">Analyze</h3>
                <p className="text-sm text-muted-foreground">
                  AI extracts behavioral and physiological signals
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-gradient-to-r from-accent to-transparent" />
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="p-6 rounded-xl border border-border/40 bg-background">
                <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold mb-4">
                  3
                </div>
                <h3 className="font-bold mb-2">Fuse</h3>
                <p className="text-sm text-muted-foreground">
                  Multimodal fusion engine combines all signals
                </p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-gradient-to-r from-accent to-transparent" />
            </div>

            {/* Step 4 */}
            <div className="relative">
              <div className="p-6 rounded-xl border border-border/40 bg-background">
                <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold mb-4">
                  4
                </div>
                <h3 className="font-bold mb-2">Decide</h3>
                <p className="text-sm text-muted-foreground">
                  Real-time risk score and explainable verdict
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section id="tech" className="py-20 md:py-32 border-t border-border/40">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Built on Cutting-Edge Tech</h2>
            <p className="text-lg text-muted-foreground">
              Powered by the latest advances in computer vision and AI.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Tech Stack */}
            <div className="p-8 rounded-xl border border-border/40 bg-card/50">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-accent" />
                Frontend Stack
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Next.js & React</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Modern</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">MediaPipe Vision</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Real-time</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tailwind CSS</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Responsive</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">WebSocket Streaming</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Live</span>
                </div>
              </div>
            </div>

            {/* Backend Stack */}
            <div className="p-8 rounded-xl border border-border/40 bg-card/50">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-accent" />
                Backend Stack
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">FastAPI</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Fast</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Python ML Pipeline</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Powerful</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pydantic Validation</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Robust</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Explainable AI (XAI)</span>
                  <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent">Transparent</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key Technologies */}
          <div className="mt-12 p-8 rounded-xl border border-border/40 bg-card/50 max-w-4xl mx-auto">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Brain className="w-5 h-5 text-accent" />
              Advanced Algorithms
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-2">rPPG Technology</h4>
                <p className="text-sm text-muted-foreground">
                  Remote Photoplethysmography for contactless heart rate measurement
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">EVM Analysis</h4>
                <p className="text-sm text-muted-foreground">
                  Eulerian Video Magnification for subtle pulse detection
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Fusion Engine</h4>
                <p className="text-sm text-muted-foreground">
                  Weighted multimodal signal fusion with explainable scoring
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 md:py-32 border-t border-border/40 bg-card/30">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Use Cases</h2>
            <p className="text-lg text-muted-foreground">
              Trusted by security professionals across industries.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Airport Security", desc: "Identify high-risk individuals for secondary screening" },
              { title: "Law Enforcement", desc: "Provide objective insights during interviews and interrogations" },
              { title: "Remote Proctoring", desc: "Detect potential cheating during online examinations" },
              { title: "Financial Services", desc: "Enhance fraud detection during customer onboarding" },
            ].map((useCase, i) => (
              <div key={i} className="p-6 rounded-xl border border-border/40 bg-background hover:bg-card/50 transition">
                <h3 className="font-bold mb-2">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground">{useCase.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 border-t border-border/40">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to See Beyond the Surface?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Experience the future of intelligent security analysis. Start with a free trial today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => window.location.href = DASHBOARD_APP_URL}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Launch Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-border hover:bg-card"
                onClick={() => window.location.href = `mailto:contact@security-copilot.com?subject=Demo%20Request`}
              >
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/30 py-12">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <Shield className="w-5 h-5 text-accent-foreground" />
                </div>
                <span className="font-bold">Security Copilot</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered deception detection for safer interactions.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition">Features</a></li>
                <li><a href="#" className="hover:text-foreground transition">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground transition">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition">About</a></li>
                <li><a href="#" className="hover:text-foreground transition">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition">Terms</a></li>
                <li><a href="#" className="hover:text-foreground transition">Cookies</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/40 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-muted-foreground">
            <p>&copy; 2026 Security Copilot. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-foreground transition">Twitter</a>
              <a href="#" className="hover:text-foreground transition">LinkedIn</a>
              <a href="#" className="hover:text-foreground transition">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
