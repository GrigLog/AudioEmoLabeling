import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { app as state } from './lib/app.svelte';

const app = mount(App, { target: document.getElementById('app')! });

if (import.meta.env.DEV) (window as unknown as { __app: typeof state }).__app = state;

export default app;
