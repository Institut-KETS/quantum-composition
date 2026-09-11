import { createRoot } from 'react-dom/client';
import Home from './Home';
import './style.css';
import { french } from './i18n';

document.title = french ? 'Un accord de trois sons et l’espace entre eux — Musique quantique' : 'A triad & the space between — Quantum Music';

createRoot(document.getElementById('root')!).render(<Home />);
