import {
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Typography,
} from '@mui/material';
import { green } from '@mui/material/colors';
const Server = (props) => {
  const { name, value, progress, image = null, loading } = props;
  return (
    <Card
      sx={{
        m: 1,
        position: 'relative',
        width: 200,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {image && (
        <CardMedia
          sx={{ height: 140 }}
          image={image.link}
          title={image.title}
        />
      )}
      <Typography>{name}</Typography>
      {progress && (
        <CardContent
          sx={{
            width: 180,
            height: 220,
            borderRadius: '50%',
          }}
        >
          <CircularProgress
            variant={loading ? 'indeterminate' : 'determinate'}
            value={value ? value : 0}
            size={180}
            sx={{
              color: green[500],
              position: 'relative',
              top: 0,
              left: -6,
              zIndex: 1,
            }}
          />
          <Typography
            variant="caption"
            component="div"
            sx={{
              color: 'text.secondary',
              fontSize: 44,
              position: 'relative',
              top: -140,
            }}
          >
            {`${value ? value : 0}%`}
          </Typography>
        </CardContent>
      )}
      {!progress && (
        <CardContent>
          {loading && (
            <CircularProgress
              variant={loading ? 'indeterminate' : 'determinate'}
              value={value ? value : 0}
              size={180}
              sx={{
                color: green[500],
                position: 'relative',
                top: 0,
                left: -6,
                zIndex: 1,
              }}
            />
          )}
          <Typography
            sx={{
              display: 'block',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: 26,
              position: 'relative',
              top: 80,
            }}
          >
            {value}
          </Typography>
        </CardContent>
      )}
    </Card>
  );
};

export default Server;
