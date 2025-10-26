"use client";

import Image from "next/image";
import * as React from "react";

export type LogoProps = {
  variant?: "full" | "icon";
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
  alt?: string;
};

export function Logo({
  variant = "full",
  size = "md",
  className = "",
  priority = true,
  alt = "ShopWriter",
}: LogoProps) {
  const src = variant === "icon" ? "/logo-icon.png" : "/logo.png";

  let width = 180;
  let height = 48;

  if (variant === "icon") {
    // Header視認性優先: 40px / 48px / 56px
    if (size === "sm") {
      width = 40;
      height = 40;
    } else if (size === "md") {
      width = 48;
      height = 48;
    } else {
      width = 56;
      height = 56;
    }
  } else {
    // フルロゴ（文字つき）の想定サイズ
    if (size === "sm") {
      width = 140;
      height = 36;
    } else if (size === "md") {
      width = 180;
      height = 48;
    } else {
      width = 220;
      height = 58;
    }
  }

  return (
    <span
      className={[
        "inline-flex items-center select-none",
        className,
      ].join(" ")}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
      />
    </span>
  );
}
