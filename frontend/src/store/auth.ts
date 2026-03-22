import { create } from "zustand";
import api from "@/lib/api";

interface AuthStore {
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  token: localStorage.getItem("access_token"),

  login: async (username, password) => {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    const { data } = await api.post("/auth/login", form);
    localStorage.setItem("access_token", data.access_token);
    set({ token: data.access_token });
  },

  logout: () => {
    localStorage.removeItem("access_token");
    set({ token: null });
  },
}));
