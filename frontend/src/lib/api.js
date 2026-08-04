import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ss_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const adminApi = axios.create({ baseURL: API });
adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("ss_admin_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const saveAuth = (token, user) => {
  localStorage.setItem("ss_token", token);
  localStorage.setItem("ss_user", JSON.stringify(user));
};
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem("ss_user") || "null"); } catch { return null; }
};
export const clearAuth = () => {
  localStorage.removeItem("ss_token");
  localStorage.removeItem("ss_user");
};
