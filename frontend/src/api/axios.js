import axios from "axios";

// Update this to your deployed backend URL once live.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach the JWT to every request, if we have one.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("afc_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the token is rejected, clear it so the user is sent back to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("afc_token");
      localStorage.removeItem("afc_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
