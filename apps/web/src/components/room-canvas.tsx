import "@excalidraw/excalidraw/index.css";
import "./room-canvas.css";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chimera2/ui/components/dropdown-menu";
import { Excalidraw, THEME } from "@excalidraw/excalidraw";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, LogOut, Menu, Moon, Rows3, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { randomUserColor, USER_PALETTE, userColor } from "@/utils/user-color";
import { trpc } from "@/utils/trpc";

export type RoomMenuInfo = {
  id: string;
  name: string;
  role: "master" | "player";
  inviteToken: string | null;
};

export default function RoomCanvas({ room }: { room: RoomMenuInfo }) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="relative h-full w-full">
      <Excalidraw
        theme={resolvedTheme === "dark" ? THEME.DARK : THEME.LIGHT}
        renderTopRightUI={() => null}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
        }}
      />
      <RoomMenu room={room} />
    </div>
  );
}

function RoomMenu({ room }: { room: RoomMenuInfo }) {
  const navigate = useNavigate();
  const { data: session, refetch } = authClient.useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const assignedDefault = useRef(false);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const name = session?.user.name ?? "?";
  const savedColor = session?.user.color as string | null | undefined;
  const color = savedColor ?? userColor(session?.user.id ?? "?");
  const dark = resolvedTheme === "dark";
  const inviteUrl =
    room.inviteToken != null ? `${window.location.origin}/invite/${room.inviteToken}` : null;

  const setColor = useMutation(
    trpc.profile.setColor.mutationOptions({
      onSuccess: () => refetch(),
    }),
  );

  useEffect(() => {
    if (session && !savedColor && !assignedDefault.current) {
      assignedDefault.current = true;
      setColor.mutate({ color: randomUserColor() });
    }
  }, [session, savedColor, setColor]);

  async function copyInvite() {
    if (!inviteUrl) return;
    // navigator.clipboard needs a secure context; plain http dev servers throw.
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inviteInputRef.current?.focus();
      inviteInputRef.current?.select();
      toast.error("Clipboard blocked here, copy the link manually");
    }
  }

  async function signOut() {
    await authClient.signOut();
    navigate("/login");
  }

  return (
    <div className="absolute left-3 top-3 z-10 flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Room menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Menu className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="font-semibold">{room.name}</div>
              <div className="font-normal opacity-60">
                {room.role === "master" ? "Master" : "Player"}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {room.role === "master" && inviteUrl && (
            <>
              <DropdownMenuItem onSelect={copyInvite}>
                <Copy className="h-4 w-4" />
                {copied ? "Invite copied" : "Copy invite link"}
              </DropdownMenuItem>
              <div className="px-2 py-1.5">
                <div className="mb-1 text-xs opacity-60">Invite link</div>
                <input
                  ref={inviteInputRef}
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                />
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => navigate("/")}>
            <Rows3 className="h-4 w-4" />
            Back to rooms
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="mb-2 opacity-60">Profile color</div>
              <div className="flex items-center gap-1.5">
                {USER_PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    aria-label={`Use color ${swatch}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor.mutate({ color: swatch })}
                  >
                    {color === swatch && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
                <label
                  className="flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed"
                  title="Custom color"
                >
                  <input
                    type="color"
                    className="h-0 w-0 opacity-0"
                    value={color}
                    onChange={(e) => setColor.mutate({ color: e.target.value })}
                  />
                  <span className="text-xs font-bold">+</span>
                </label>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal opacity-60">
              {session?.user.email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onSelect={signOut}>
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: color }}
          title={name}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="rounded bg-background/80 px-2 py-1 text-xs leading-tight backdrop-blur">
          <div className="font-semibold">{name}</div>
          <div className="opacity-60">{room.role === "master" ? "Master" : "Player"}</div>
        </div>
      </div>
    </div>
  );
}
