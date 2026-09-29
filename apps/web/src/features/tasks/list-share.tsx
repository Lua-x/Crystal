import { SHARE_ROLES, type List, type ShareRole } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { IconButton } from '../../components/ui/icon-button'
import { Select } from '../../components/ui/select'
import { useMe } from '../shell/use-me'
import {
  membersQuery,
  peopleQuery,
  useChangeMemberRole,
  useRemoveMember,
  useShareList,
} from './data'

interface ShareDialogProps {
  list: List
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Owners share the list and manage access; everyone else sees who has access. */
export function ShareDialog({ list, open, onOpenChange }: ShareDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        list.role === 'owner'
          ? t('sharing.title', { name: list.name })
          : t('sharing.membersTitle', { name: list.name })
      }
    >
      {open && <ShareContent list={list} />}
    </Dialog>
  )
}

function ShareContent({ list }: { list: List }) {
  const { t } = useTranslation()
  const me = useMe()
  const isOwner = list.role === 'owner'
  const { data: members = [] } = useQuery(membersQuery(list.id))
  const { data: people = [], isPending: peoplePending } = useQuery({
    ...peopleQuery,
    enabled: isOwner,
  })
  const changeRole = useChangeMemberRole()
  const remove = useRemoveMember()
  const peopleId = useId()
  // The member list itself shows the result; screen readers hear it. (A toast
  // would also take the next Escape away from the dialog.)
  const [announcement, setAnnouncement] = useState('')

  const roleLabel = (role: string) => t(`sharing.roles.${role}` as 'sharing.roles.owner')

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <section aria-labelledby={peopleId} className="flex flex-col gap-2">
        <h3 id={peopleId} className="text-subhead font-semibold text-text-secondary">
          {t('sharing.people')}
        </h3>
        <ul className="divide-y divide-separator overflow-hidden rounded-xl bg-cell shadow-sm">
          {members.map((member) => {
            const name =
              member.userId === me.id
                ? t('sharing.you', { name: member.displayName })
                : member.displayName
            const editable = isOwner && member.role !== 'owner'
            return (
              <li key={member.userId} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <Avatar name={member.displayName} seed={member.userId} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-callout">{name}</div>
                  <div className="truncate text-footnote text-text-secondary">
                    @{member.username}
                  </div>
                </div>
                {editable ? (
                  <>
                    <Select
                      aria-label={t('sharing.roleOf', { name: member.displayName })}
                      value={member.role}
                      onChange={(event) =>
                        changeRole.mutate({
                          listId: list.id,
                          userId: member.userId,
                          role: event.target.value as ShareRole,
                        })
                      }
                      className="h-8 text-footnote"
                    >
                      {SHARE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </Select>
                    <IconButton
                      label={t('sharing.remove', { name: member.displayName })}
                      onClick={() =>
                        remove.mutate(
                          { listId: list.id, userId: member.userId },
                          {
                            onSuccess: () =>
                              setAnnouncement(t('sharing.removed', { name: member.displayName })),
                          },
                        )
                      }
                    >
                      <X />
                    </IconButton>
                  </>
                ) : (
                  <span className="shrink-0 text-footnote text-text-secondary">
                    {roleLabel(member.role)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {isOwner && !peoplePending && (
        <AddPerson
          listId={list.id}
          candidates={people.filter(
            (person) => !members.some((member) => member.userId === person.id),
          )}
          alone={people.length === 0}
          onShared={(name) => setAnnouncement(t('sharing.shared', { name }))}
        />
      )}
    </div>
  )
}

function AddPerson({
  listId,
  candidates,
  alone,
  onShared,
}: {
  listId: string
  candidates: { id: string; username: string; displayName: string }[]
  alone: boolean
  onShared: (name: string) => void
}) {
  const { t } = useTranslation()
  const share = useShareList()
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<ShareRole>('editor')
  const headingId = useId()
  const hintId = useId()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const person = candidates.find((candidate) => candidate.id === personId)
    if (!person) return
    share.mutate(
      { listId, userId: person.id, role },
      {
        onSuccess: () => {
          setPersonId('')
          onShared(person.displayName)
        },
      },
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-subhead font-semibold text-text-secondary">
        {t('sharing.add')}
      </h3>
      {alone || candidates.length === 0 ? (
        <p className="text-callout text-text-secondary">
          {alone ? t('sharing.alone') : t('sharing.nobody')}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2" aria-describedby={hintId}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Select
                aria-label={t('sharing.person')}
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
              >
                <option value="" disabled>
                  {t('sharing.choose')}
                </option>
                {candidates.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName} (@{person.username})
                  </option>
                ))}
              </Select>
            </div>
            <Select
              aria-label={t('sharing.role')}
              value={role}
              onChange={(event) => setRole(event.target.value as ShareRole)}
            >
              {SHARE_ROLES.map((value) => (
                <option key={value} value={value}>
                  {t(`sharing.roles.${value}`)}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary" disabled={!personId} loading={share.isPending}>
              {t('sharing.submit')}
            </Button>
          </div>
          <p id={hintId} className="text-footnote text-text-secondary">
            {t('sharing.roleHint')}
          </p>
        </form>
      )}
    </section>
  )
}
