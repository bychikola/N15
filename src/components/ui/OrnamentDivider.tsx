import type { FC } from 'react'

type OrnamentVariant = 'solar' | 'woven' | 'simple'

interface OrnamentDividerProps {
  variant?: OrnamentVariant
  className?: string
}

const SolarPattern = () => (
  <svg
    width="100%"
    height="32"
    viewBox="0 0 1200 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
  >
    <line
      x1="0"
      y1="16"
      x2="1200"
      y2="16"
      stroke="url(#goldGradient)"
      strokeWidth="1"
      strokeDasharray="4 8"
    />
    <circle cx="600" cy="16" r="6" stroke="url(#goldGradient)" strokeWidth="1" />
    <circle cx="600" cy="16" r="2" fill="url(#goldGradient)" />
    <line x1="560" y1="16" x2="570" y2="16" stroke="url(#goldGradient)" strokeWidth="0.5" />
    <line x1="630" y1="16" x2="640" y2="16" stroke="url(#goldGradient)" strokeWidth="0.5" />
    <defs>
      <linearGradient id="goldGradient" x1="0" y1="0" x2="1200" y2="0">
        <stop offset="0%" stopColor="#C8A44E" stopOpacity="0" />
        <stop offset="20%" stopColor="#C8A44E" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#C8A44E" stopOpacity="1" />
        <stop offset="80%" stopColor="#C8A44E" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#C8A44E" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
)

// Осетинский орнамент: полоса повторяется по ширине футера.
//
// background-repeat: round — браузер сам подбирает ЦЕЛОЕ число мотивов и
// подгоняет их ширину под контейнер. Узор (2003×325) бесшовный: его правый
// край продолжается левым, а стык плиток приходится на узкое место волны,
// поэтому по краям нет срезанного мотива — с repeat-x последний мотив
// обрубался ровно по границе контейнера, это и читалось как «обрезано».
//
// Высота задана по брейкпоинтам: от неё зависит натуральная ширина мотива
// (высота × 6,16), а значит и то, насколько браузеру придётся подогнать
// плитку. Шаги подобраны под ширину полосы на каждом брейкпоинте так, чтобы
// мотивов в строке было целое число, а подгонка выходила минимальной:
// телефон — 2 мотива (высота 27px: на 360–390px подгонка меньше 2%),
// планшет 714px — 4, ноутбук 982px — 5, широкий экран 1238px — 6 (1,5%).
// С одной высотой 35px на телефоне в строку влезал бы один мотив, и его
// растянуло бы на 47% — узор выглядел бы расплющенным.
const WovenPattern = () => (
  <div
    className="h-[27px] lg:h-[30px] xl:h-[33px]"
    style={{
      backgroundImage: 'url(/img/os-arnament.png)',
      backgroundRepeat: 'round',
      // auto 100%: плитка ровно по высоте полосы, пропорции не ломаются
      backgroundSize: 'auto 100%',
      // left: сетка мотивов начинается от левого края — без случайного сдвига
      backgroundPosition: 'left top',
    }}
  />
)

const SimplePattern = () => (
  <div className="n15-gold-divider" />
)

export const OrnamentDivider: FC<OrnamentDividerProps> = ({
  variant = 'simple',
  className = '',
}) => {
  const Pattern = {
    solar: SolarPattern,
    woven: WovenPattern,
    simple: SimplePattern,
  }[variant]

  return (
    // Отступы задаёт вызывающая сторона (className); по умолчанию — my-16
    <div className={className || 'my-16'}>
      <Pattern />
    </div>
  )
}
