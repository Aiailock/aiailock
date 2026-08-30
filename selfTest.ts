{
  "name": "whatsapp-timeline",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx",
    "typecheck": "tsc --noEmit",
    "test:parser": "node --import tsx server/parser/selfTest.ts",
    "test:media": "node --import tsx server/media/selfTest.ts",
    "test:ai": "node --import tsx server/ai/selfTest.ts",
    "test": "npm run test:parser && npm run test:media && npm run test:ai"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "clsx": "^2.1.1",
    "framer-motion": "^11.5.6",
    "lucide-react": "^0.445.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@types/node": "^22.7.4",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^8.5.0",
    "@typescript-eslint/parser": "^8.5.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.11",
    "fflate": "^0.8.3",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.5",
    "vite-plugin-pwa": "^0.20.5",
    "tsx": "^4.19.2"
  }
}
