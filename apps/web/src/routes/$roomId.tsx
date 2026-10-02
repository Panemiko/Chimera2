import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { lazy } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TRPCClientError } from "@trpc/client";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import RoomOverlays from "@/components/room-overlays";
import type { Route } from "./+types/$roomId";

const RoomCanvas = lazy(() => import("@/components/room-canvas"));

export function meta({}: Route.MetaArgs) {
  return [{ title: "Room" }];
}

export default function Room() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { data: session, isPending } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  const room = useQuery(trpc.rooms.get.queryOptions({ id: roomId ?? "" }, { enabled: !!session && !!roomId }));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      navigate("/login");
    }
  }, [session, isPending, navigate]);

  if (isPending || !session) {
    return <div className="h-full w-full" />;
  }

  if (room.isLoading) {
    return <div className="container mx-auto max-w-2xl px-4 py-6">Loading room...</div>;
  }

  if (room.isError) {
    const code =
      room.error instanceof TRPCClientError ? room.error.data?.code : undefined;
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-2 text-xl font-semibold">
          {code === "FORBIDDEN" ? "Not a member" : "Room not found"}
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {code === "FORBIDDEN"
            ? "Ask the master for an invite link to join this room."
            : "This room does not exist."}
        </p>
        <Link className="rounded border px-3 py-1 text-sm" to="/">
          Back to rooms
        </Link>
      </div>
    );
  }

  const roomData = room.data;
  if (!roomData || !mounted) {
    return <div className="h-full w-full" />;
  }

  return (
    <div className="relative flex h-full w-full">
      <div className="min-h-0 min-w-0 flex-1">
        <Suspense fallback={<div className="h-full w-full" />}>
          <RoomCanvas
            room={{
              id: roomData.id,
              name: roomData.name,
              role: roomData.role,
              inviteToken: roomData.inviteToken,
            }}
          />
        </Suspense>
      </div>
      <RoomOverlays roomId={roomData.id} />
    </div>
  );
}
