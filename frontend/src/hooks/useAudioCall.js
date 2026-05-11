import { useContext } from 'react';
import CallContext from '../context/callContext';

export const useAudioCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useAudioCall must be used within a CallProvider');
  }
  return context;
};

export default useAudioCall;
