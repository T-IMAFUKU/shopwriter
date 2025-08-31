export default function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-8 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Inovista Inc. All rights reserved.</p>
      </div>
    </footer>
  )
}
