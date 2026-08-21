import { render, screen } from '@testing-library/react';
import App from './App';

test('renders deadline dashboard', () => {
  render(<App />);
  const linkElement = screen.getByRole('heading', { name: /wizard schedule & snippets/i });
  expect(linkElement).toBeInTheDocument();
});
