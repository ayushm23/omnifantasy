import { getSportColor, getSportDisplayCode } from '../config/sports';

const SIZE = {
  sm:   'text-[10px] px-1.5 py-0.5 rounded border font-semibold',
  md:   'text-[10px] px-2 py-0.5 rounded border font-semibold',
  pill: 'px-3 py-1 rounded-full text-xs font-semibold border',
};

export default function SportBadge({ sport, size = 'sm', className = '' }) {
  return (
    <span className={`${SIZE[size]} ${getSportColor(sport)}${className ? ` ${className}` : ''}`}>
      {getSportDisplayCode(sport)}
    </span>
  );
}
