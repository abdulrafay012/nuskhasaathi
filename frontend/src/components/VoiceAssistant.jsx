import { useState, useEffect, useRef } from 'react';
import { speak, cancelSpeech } from '../speech';

export default function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check if browser supports SpeechRecognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      // Use Urdu if available, else default
      recognitionRef.current.lang = 'ur-PK';

      recognitionRef.current.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        setTranscript(`You: ${text}`);
        setIsListening(false);
        handleVoiceCommand(text);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          alert('Microphone access is blocked. Please allow microphone access to use voice commands.');
        } else {
          setTranscript("Couldn't hear clearly. Please try again.");
          setTimeout(() => setTranscript(''), 3000);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const handleVoiceCommand = async (command) => {
    setIsProcessing(true);
    cancelSpeech(); // Stop any ongoing speech

    try {
      // Mocking the intent response for the hackathon demo since we don't have a global context API yet
      let answer_ur = "میں آپ کی بات سمجھ گیا۔";
      
      if (command.includes('schedule') || command.includes('وقت') || command.includes('ٹائم')) {
        answer_ur = "آپ کا اگلا ڈوز دوپہر کو ہے، جس میں آپ کو ایک پیناڈول لینی ہے۔";
      } else if (command.includes('medicine') || command.includes('دوا') || command.includes('دوائی')) {
        answer_ur = "آپ کے پاس اس وقت تین ادویات ہیں۔ پیناڈول، میٹفارمین اور بروفین۔";
      } else {
        answer_ur = "معذرت، میں آپ کا سوال پوری طرح سمجھ نہیں سکا۔ براہ کرم دہرائیں۔";
      }
      
      speak(answer_ur, 'ur');
      setTranscript(`AI: ${answer_ur}`);
      
    } catch (err) {
      console.error(err);
      speak("نیٹ ورک کا مسئلہ ہے۔", 'ur');
      setTranscript("Network error. Please try again.");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setTranscript(''), 7000);
    }
  };

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      cancelSpeech(); // Stop AI speaking if user interrupts
      setTranscript('Listening... Speak now.');
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (!recognitionRef.current) {
    return null; // Browser doesn't support speech recognition
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {transcript && (
        <div className="max-w-xs rounded-2xl border border-teal-200 bg-white p-4 shadow-lg text-right">
           <p className="text-sm font-semibold text-teal-900" dir="rtl">{transcript}</p>
        </div>
      )}
      <button
        onClick={toggleListen}
        disabled={isProcessing}
        className={`flex h-16 w-16 items-center justify-center rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95 ${
          isListening ? 'bg-rose-500 animate-pulse ring-4 ring-rose-200' : 
          isProcessing ? 'bg-amber-400' : 'bg-primary hover:bg-primary-dark ring-4 ring-teal-100'
        }`}
      >
        {isListening ? (
          <span className="text-3xl">🛑</span>
        ) : isProcessing ? (
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
        ) : (
          <span className="text-3xl text-white">🎤</span>
        )}
      </button>
    </div>
  );
}
