import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { COLUMN_ICONS } from '../config/constants';

const IconRenderer = ({ iconName, size = 20, className }) => {
  const IconComponent = COLUMN_ICONS[iconName] || Gamepad2;
  return <IconComponent size={size} className={className} />;
};

export default IconRenderer;