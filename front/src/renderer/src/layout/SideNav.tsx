import { useEffect, useState } from 'react';
import { Box, NavLink as MantineNavLink, ScrollArea, Text, Tooltip } from '@mantine/core';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { NAV_SECTIONS } from './nav';

interface SideNavProps {
  collapsed: boolean;
}

export function SideNav({ collapsed }: SideNavProps) {
  const location = useLocation();
  const activeSection = NAV_SECTIONS.find((section) =>
    section.items.some((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
    ),
  )?.label ?? null;

  const [openSections, setOpenSections] = useState<string[]>(
    activeSection ? [activeSection] : [],
  );

  useEffect(() => {
    if (activeSection) {
      setOpenSections((open) =>
        open.includes(activeSection) ? open : [...open, activeSection],
      );
    }
  }, [activeSection]);

  const toggleSection = (label: string) => {
    setOpenSections((open) =>
      open.includes(label) ? open.filter((s) => s !== label) : [...open, label],
    );
  };

  const isItemActive = (to: string): boolean =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  if (collapsed) {
    return (
      <ScrollArea h='100%' type='always' scrollbarSize={5} offsetScrollbars>
        {NAV_SECTIONS.flatMap((section) => section.items).map((item) => (
          <Tooltip
            key={item.to}
            label={item.label}
            position='right'
            withinPortal
            transitionProps={{ duration: 0 }}>
            <MantineNavLink
              component={RouterNavLink}
              to={item.to}
              end={item.to === '/'}
              active={isItemActive(item.to)}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.5} />}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 0',
                borderRadius: 'var(--mantine-radius-md)',
              }}
            />
          </Tooltip>
        ))}
      </ScrollArea>
    );
  }

  return (
    <ScrollArea h='100%' type='always' scrollbarSize={5} offsetScrollbars>
      {NAV_SECTIONS.map((section) => {
        const isOpen = openSections.includes(section.label);
        const isActive = activeSection === section.label;
        return (
          <Box key={section.label} mb='xs'>
            <MantineNavLink
              onClick={() => toggleSection(section.label)}
              label={section.label}
              leftSection={<section.icon size={18} stroke={1.5} />}
              active={isActive}
              rightSection={
                <Box
                  component='span'
                  style={{
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform 150ms ease',
                    fontSize: 10,
                    color: 'var(--mantine-color-dark-2)',
                  }}>
                  ▸
                </Box>
              }
              styles={{
                root: {
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: 'var(--mantine-font-size-xs)',
                  color: isActive
                    ? 'var(--mantine-primary-color-filled)'
                    : 'var(--mantine-color-dark-2)',
                },
              }}
            />
            {isOpen && (
              <Box pl='sm'>
                {section.items.map((item) => (
                  <MantineNavLink
                    key={item.to}
                    component={RouterNavLink}
                    to={item.to}
                    end={item.to === '/'}
                    active={isItemActive(item.to)}
                    leftSection={<item.icon size={18} stroke={1.5} />}
                    label={item.label}
                  />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
      <Text size='xs' c='dimmed' px='sm' mt='xl' ta='center'>
        Homeserver
      </Text>
    </ScrollArea>
  );
}
