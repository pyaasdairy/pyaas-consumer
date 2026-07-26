import React from 'react';
import { View, StyleSheet, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';

/**
 * Renders a product pack shot as 2-3 overlapping, fanned layers to signal a
 * grouped / bulk pack. Only one source photo exists per product line, so this
 * is the same image transformed (offset + slight rotation + descending scale
 * and opacity), NOT distinct shots. Must sit inside an overflow:hidden tile so
 * the fan never bleeds outside its box.
 */
export function StackedProductImage({
  source,
  count = 2,
  width = '78%',
  height = '88%',
}: {
  source: ImageSourcePropType;
  count?: number;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
}) {
  const n = Math.min(Math.max(Math.round(count), 2), 3);
  const layers = [];
  // Deepest (back) layer first so the front (depth 0) paints on top.
  for (let depth = n - 1; depth >= 0; depth--) {
    const dir = depth % 2 === 1 ? 1 : -1; // alternate the fan side
    layers.push(
      <View
        key={depth}
        style={[
          StyleSheet.absoluteFill,
          {
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 1 - depth * 0.16,
            transform: [
              { translateX: depth * 16 * dir },
              { translateY: depth * -6 },
              { rotate: `${depth * 7 * dir}deg` },
              { scale: 1 - depth * 0.05 },
            ],
          },
        ]}
      >
        <Image source={source} style={{ width, height }} contentFit="contain" transition={200} />
      </View>
    );
  }
  return <View style={StyleSheet.absoluteFill}>{layers}</View>;
}
