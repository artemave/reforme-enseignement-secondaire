import { preserveDocumentScroll } from './navigation.js';
import type { AnnotationIndex } from './model.js';

export function renderHelp(index: AnnotationIndex, root: Document): void {
  root.querySelectorAll<HTMLElement>('.site-header').forEach((header) => { header.hidden = true; });
  const main = root.querySelector('main');
  if (main === null) throw new Error('Missing main element');
  main.className = 'help-page';
  main.innerHTML = `    <h1>Comment ça marche</h1>
    <p>Les discussions sont hébergées sur GitHub et affichées ici grâce à giscus. Les bulles ouvrent les échanges liés au document, à une section ou à un paragraphe.</p>
    <h2>Pourquoi une discussion a-t-elle disparu ?</h2>
    <p>Seules les discussions ouvertes apparaissent ici. Si un fil manque, il a probablement été fermé sur GitHub, où il reste consultable. La mise à jour du site peut prendre quelques minutes.</p>
    <h2>Comment recevoir des notifications ?</h2>
    <p>GitHub vous informe des réponses sur le site ou par e-mail, selon vos réglages. Pour suivre un fil, utilisez « Subscribe » sur sa page GitHub.</p>
    <h2>Faut-il un compte GitHub ?</h2>
    <p>La lecture est libre. Pour commenter, connectez-vous à GitHub et autorisez giscus. Vos commentaires sont publiés sur GitHub.</p>`;
  const back = root.createElement('a');
  back.href = './';
  back.dataset['documentBack'] = '';
  back.innerHTML = '<span class="back-chevron" aria-hidden="true">‹</span>Revenir au document';
  preserveDocumentScroll(root, back);
  main.prepend(back);
  const repository = root.createElement('a');
  repository.id = 'repository';
  repository.textContent = 'Voir le projet sur GitHub ↗';
  repository.href = `https://github.com/${index.repository}`;
  const paragraph = root.createElement('p'); paragraph.append(repository); main.append(paragraph);
  for (const navigation of root.querySelectorAll('#contents')) {
    navigation.replaceChildren();
    for (const section of index.units.filter((unit) => unit.kind === 'section')) {
      const anchor = root.createElement('a');
      anchor.textContent = section.label;
      anchor.href = new URL(`./#${section.id}`, root.baseURI).href;
      navigation.append(anchor);
    }
  }
  root.title = 'Comment ça marche — Document';
}
