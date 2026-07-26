import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../lib/theme';

/** Compact 5-star rating row: filled / half / empty stars, an optional numeric
 *  value, and an optional rating count (formatted 2.1k etc.). */
export function Stars({
  rating,
  count,
  size = 12,
  showValue = true,
  color = colors.gold,
  textColor = colors.inkSoft,
}: {
  rating: number;
  count?: number;
  size?: number;
  showValue?: boolean;
  color?: string;
  textColor?: string;
}) {
  const rounded = Math.round(rating * 2) / 2; // nearest half
  const icons: ('star' | 'star-half' | 'star-outline')[] = [];
  for (let i = 1; i <= 5; i++) {
    if (rounded >= i) icons.push('star');
    else if (rounded >= i - 0.5) icons.push('star-half');
    else icons.push('star-outline');
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <View style={{ flexDirection: 'row', gap: 1 }}>
        {icons.map((n, i) => (
          <Ionicons key={i} name={n} size={size} color={color} />
        ))}
      </View>
      {showValue ? (
        <Text style={{ fontFamily: fonts.sansSemi, fontSize: size, color: textColor, marginLeft: 2 }}>{rating.toFixed(1)}</Text>
      ) : null}
      {count != null ? (
        <Text style={{ fontFamily: fonts.sansMed, fontSize: size - 1, color: textColor }}>({fmtCount(count)})</Text>
      ) : null}
    </View>
  );
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
