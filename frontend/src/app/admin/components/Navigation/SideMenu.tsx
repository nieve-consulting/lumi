import AdminNav from "./AdminNav"
import Brand from "./Brand"

// Desktop navigation. Below lg the header's MobileMenu opens the same links in a drawer
export default function SideMenu() {
  return (
    <div
      id="admin-sidebar"
      className="w-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col gap-4 overflow-y-auto border-r border-slate-300 bg-white p-3 lg:flex"
    >
      <Brand />
      <AdminNav className="flex-1" />
    </div>
  )
}
