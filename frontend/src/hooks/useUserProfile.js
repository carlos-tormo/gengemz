import { useEffect, useState } from 'react';
import {
  createDebugProfiles,
  getPublicProfile,
  loadProfileBoard,
  saveUserSettings,
  searchPublicProfiles,
  subscribeToUserSettings,
} from '../services/profileService';

const initialUserSettings = {
  privacy: '',
  bio: '',
  displayName: '',
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

  const saveSettings = async (settings) => {
    setUserSettings(settings);
    await saveUserSettings(user, settings);
  };

  const seedDebugProfiles = async () => {
    await createDebugProfiles(user);
  };

  return {
    userSettings,
    setUserSettings,
    isOnboardingModalOpen,
    setIsOnboardingModalOpen,
    saveUserSettings: saveSettings,
    createDebugProfiles: seedDebugProfiles,
    searchPublicProfiles,
    getPublicProfile,
    loadProfileBoard,
  };
};

export default useUserProfile;
