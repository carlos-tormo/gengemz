import { useEffect, useMemo, useState } from 'react';
import {
  completeQuestOnboarding as completeQuestOnboardingRequest,
  createDebugProfiles,
  getPublicProfile,
  loadProfileBoard,
  loadProfileBoardModel,
  saveUserSettings,
  searchPublicProfiles,
  subscribeToUserGames,
  subscribeToUserSettings,
} from '../services/profileService';

const initialUserSettings = {
  privacy: '',
  bio: '',
  displayName: '',
  questOnboardingCompleted: false,
};

const useUserProfile = (user) => {
  const [userSettings, setUserSettings] = useState(initialUserSettings);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  useEffect(() => {
    return subscribeToUserSettings(
      user,
      setUserSettings,
      setIsOnboardingModalOpen,
      (error) => console.error('User settings load failed', error),
    );
  }, [user]);

  // Derived, not its own state: it reacts to Firestore data (not to the privacy modal
  // directly), which is what makes the quest onboarding both fire right after
  // `handleOnboardingComplete` (privacy just became truthy) and resume on a later login
  // (privacy already true, flag still false) through the same settings snapshot.
  const isQuestOnboardingOpen = useMemo(
    () => !!user && !user.isAnonymous && !!userSettings.privacy && !userSettings.questOnboardingCompleted,
    [user, userSettings.privacy, userSettings.questOnboardingCompleted],
  );

  const saveSettings = async (settings) => {
    setUserSettings(settings);
    await saveUserSettings(user, settings);
  };

  const completeQuestOnboarding = async () => {
    setUserSettings((prev) => ({ ...prev, questOnboardingCompleted: true }));
    await completeQuestOnboardingRequest(user);
  };

  const seedDebugProfiles = async () => {
    await createDebugProfiles(user);
  };

  return {
    userSettings,
    setUserSettings,
    isOnboardingModalOpen,
    setIsOnboardingModalOpen,
    isQuestOnboardingOpen,
    completeQuestOnboarding,
    saveUserSettings: saveSettings,
    createDebugProfiles: seedDebugProfiles,
    searchPublicProfiles,
    getPublicProfile,
    loadProfileBoard,
    loadProfileBoardModel,
    subscribeToUserGames,
  };
};

export default useUserProfile;
