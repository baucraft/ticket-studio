import logoUrl from "@/assets/DreesSommer_logo_black.svg"

export function BrandHeader({ appName }: { appName: string }) {
  return (
    <div className="brand-header">
      <img className="brand-header__logo" src={logoUrl} alt="Drees & Sommer" />
      <div className="brand-header__titles">
        <span className="brand-header__theme">Code X Lean</span>
        <span className="brand-header__app">{appName}</span>
      </div>
    </div>
  )
}
