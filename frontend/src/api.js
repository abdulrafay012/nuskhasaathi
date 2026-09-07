import axios from 'axios';

const API_BASE = '';

const api = axios.create({
  baseURL: API_BASE,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const signup = (data) => api.post('/auth/signup', data);
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token, newPassword) =>
  api.post('/auth/reset-password', { token, newPassword });

// Prescription
export const uploadPrescription = (formData) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const identifyMedicines = (prescription_id) =>
  api.post('/identify-medicines', { prescription_id });

export const generateInstructions = (prescription_id) =>
  api.post('/instructions', { prescription_id });

// Medicine corrections — `changes` may hold name/dosage/frequency; an empty
// object confirms the medicine was read correctly as-is.
export const correctMedicine = (id, changes = {}) => api.patch(`/medicines/${id}`, changes);

// Today's schedule (most recent prescription, bucketed by time of day)
export const getSchedule = () => api.get('/schedule');

// History
export const getHistory = () => api.get('/history');

// Reports
export const downloadReport = async (prescriptionId) => {
  const response = await api.get(`/report/${prescriptionId}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(
    new Blob([response.data], { type: 'application/pdf' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `NuskhaSaathi-Report-${prescriptionId}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Caregiver Link
export const getCaregiverToken = () => api.get('/caregiver/token');
export const regenerateCaregiverToken = () => api.post('/caregiver/token/regenerate');
export const getCaregiverView = (token) => api.get(`/caregiver/view/${token}`);

// Hackathon AI Features: AI Rehnuma Q&A, Cross-Prescriptions, Cloud Status
export const askMedicineQuestion = (prescription_id, question) =>
  api.post('/instructions/ask', { prescription_id, question });
export const getCrossInteractions = () => api.get('/history/cross-interactions');
export const getCloudHealth = () => api.get('/health/cloud');

export default api;

