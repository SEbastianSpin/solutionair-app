import { Box, Container, Typography } from '@mui/material'

export default function Home() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          Home
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome to SolutionAir
        </Typography>
      </Box>
    </Container>
  )
}
