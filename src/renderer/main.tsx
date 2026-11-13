import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boot } from './lib/store';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<App />);
boot().catch((e) => console.error('Açılış hatası', e));
