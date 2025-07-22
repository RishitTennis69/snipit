import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Search, Loader2, Check } from "lucide-react";

interface SearchProgressProps {
  isVisible: boolean;
  query: string;
}

export const SearchProgress = ({ isVisible, query }: SearchProgressProps) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "Searching for relevant articles...",
    "Analyzing article credibility...",
    "Scraping full content...",
    "AI scoring articles...",
    "Generating recommendations...",
    "Finalizing results..."
  ];

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setCurrentStep(0);
      return;
    }

    const duration = 15000; // 15 seconds
    const interval = 100; // Update every 100ms
    const increment = (interval / duration) * 100;
    const stepDuration = duration / steps.length; // Time per step

    const progressTimer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + increment;
        if (newProgress >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return newProgress;
      });
    }, interval);

    // Update current step based on progress
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => {
        const newStep = Math.floor((progress / 100) * steps.length);
        if (newStep >= steps.length) {
          clearInterval(stepTimer);
          return steps.length - 1;
        }
        return newStep;
      });
    }, stepDuration);

    return () => {
      clearInterval(progressTimer);
      clearInterval(stepTimer);
    };
  }, [isVisible, progress, steps.length]);

  if (!isVisible) return null;

  return (
    <Card className="p-6 bg-primary-muted/20 border-primary/20">
      <div className="flex items-center mb-4">
        <Loader2 className="h-5 w-5 text-primary mr-2 animate-spin" />
        <h2 className="text-xl font-semibold text-foreground">
          Searching for sources
        </h2>
      </div>
      
      <div className="mb-4">
        <p className="text-muted-foreground mb-2">
          Finding news sources for: "{query}"
        </p>
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground mt-2">
          {Math.round(progress)}% complete
        </p>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          
          return (
            <div
              key={index}
              className={`flex items-center text-sm transition-colors ${
                isCompleted || isCurrent
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {isCompleted ? (
                <Check className="h-4 w-4 mr-2 text-primary" />
              ) : (
                <Search 
                  className={`h-4 w-4 mr-2 ${
                    isCurrent 
                      ? "text-primary" 
                      : "text-muted-foreground"
                  }`} 
                />
              )}
              <span className={isCurrent ? "font-medium" : ""}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}; 