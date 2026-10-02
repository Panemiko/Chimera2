import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

import type { Route } from "./+types/invite.$token";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Join room" }];
}

export default function Invite() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { data: session, isPending } = authClient.useSession();

  const join = useMutation(
    trpc.rooms.joinByToken.mutationOptions({
      onSuccess: (room) => {
        queryClient.invalidateQueries({ queryKey: trpc.rooms.list.queryKey() });
        navigate(`/${room.id}`);
      },
    }),
  );

  useEffect(() => {
    if (!isPending && !session) {
      navigate("/login");
    }
  }, [session, isPending, navigate]);

  useEffect(() => {
    if (session && token && join.isIdle) {
      join.mutate({ token });
    }
  }, [session, token, join]);

  if (isPending || join.isPending || join.isIdle) {
    return <div className="container mx-auto max-w-2xl px-4 py-6">Joining room...</div>;
  }

  if (join.isError) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-2 text-xl font-semibold">Invalid invite</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          This invite link does not work. Ask the master for a new one.
        </p>
        <Link className="rounded border px-3 py-1 text-sm" to="/">
          Back to rooms
        </Link>
      </div>
    );
  }

  return null;
}
