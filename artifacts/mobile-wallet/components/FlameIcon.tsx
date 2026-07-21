/**
 * EmberChain flame logo — rendered from the same SVG path as favicon.svg.
 * Usage: <FlameIcon size={48} />
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface FlameIconProps {
  size?: number;
  outerColor?: string;
  innerColor?: string;
}

export function FlameIcon({
  size = 48,
  outerColor = '#FF5A00',
  innerColor = '#FFAA00',
}: FlameIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 4 C50 4 22 28 22 54 C22 70 34 84 50 84 C66 84 78 70 78 54 C78 43 72 34 72 34 C72 34 68 48 60 55 C60 55 65 38 50 4Z"
        fill={outerColor}
      />
      <Path
        d="M50 34 C50 34 36 47 36 59 C36 67 42 74 50 74 C58 74 64 67 64 59 C64 53 60 47 60 47 C60 47 58 55 54 59 C54 59 56 49 50 34Z"
        fill={innerColor}
      />
    </Svg>
  );
}
