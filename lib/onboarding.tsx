import { createContext, useContext } from 'react';

type OnboardingContextType = {
  recheckOnboarding: () => Promise<void>;
};

export const OnboardingContext = createContext<OnboardingContextType>({
  recheckOnboarding: async () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);
