import './styles.css';

// Milestone 1 placeholder. The editor replaces this once the artwork is signed off.
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <main class="placeholder">
      <h1>Hand Map</h1>
      <p>Mark problem areas on a hand diagram and download a PNG for the case file.</p>
      <p><a href="./review.html">Review the hand artwork and snap points</a></p>
      <p class="muted">Under construction. Nothing you do on this page is saved or sent anywhere.</p>
    </main>
  `;
}
