export const saveData = (setData, triggerSave) => (updater) => {
    setData(prev => {
      const newData = typeof updater === 'function' ? updater(prev) : updater;
      triggerSave(newData);
      return newData;
    });
};
