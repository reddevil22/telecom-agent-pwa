import styles from './SuggestionChips.module.css';

interface Props {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: Props) {
  return (
    <div className={styles.chips}>
      {suggestions.map((s) => (
        <button key={s} className={styles.chip} onClick={() => onSelect(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
