import './styles.css';
import './editor/editor.css';
import { mountEditor } from './editor/editor';

mountEditor(document.querySelector<HTMLDivElement>('#app')!);
