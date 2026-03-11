import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

export default function LaunchScreen({ dark, onDone = () => {} }) {
  const doneRef = React.useRef(false);

  const handlePlaybackStatus = (status) => {
    if (doneRef.current) return;
    if (status?.didJustFinish) {
      doneRef.current = true;
      onDone();
    }
  };

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      <Video
        source={require('../assets/networth_manager_premium_launch.mp4')}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        isMuted
        onPlaybackStatusUpdate={handlePlaybackStatus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative'
  },
  rootDark: {
    backgroundColor: '#000'
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%'
  }
});
